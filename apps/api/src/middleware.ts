import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { unauthorized } from './errors.js';
import type { AuthVerifier, MembershipResolver, RequestContext } from './types.js';

type ContextResponse = Response<unknown, RequestContext>;

export const authenticate = (authVerifier: AuthVerifier): RequestHandler =>
  async (request: Request, response: ContextResponse, next: NextFunction) => {
    const header = request.header('authorization');
    const match = header?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1];
    if (!token) {
      next(unauthorized());
      return;
    }

    try {
      const user = await authVerifier.verifyAccessToken(token);
      if (!user) {
        next(unauthorized('Invalid or expired access token'));
        return;
      }
      response.locals.user = user;
      next();
    } catch {
      next(unauthorized('Invalid or expired access token'));
    }
  };

export const resolveOrganization = (membershipResolver: MembershipResolver): RequestHandler =>
  async (_request: Request, response: ContextResponse, next: NextFunction) => {
    try {
      const user = response.locals.user;
      if (!user) {
        next(unauthorized());
        return;
      }
      response.locals.organizationId = await membershipResolver.resolveOrganizationId(user.userId);
      next();
    } catch (error) {
      next(error);
    }
  };
