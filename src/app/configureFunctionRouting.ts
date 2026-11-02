import { FUNCTION_ROUTES, STREAMING_FUNCTIONS } from '../../functions/src/functionDomains.mjs';
import { configureCallableRouting } from '@/shared/api/domainCallable';

// Product composition lives in app; shared only knows how to route a callable request.
configureCallableRouting(FUNCTION_ROUTES, STREAMING_FUNCTIONS);
