import type { Env as DemoBindings } from '../src/types';

declare global {
  namespace Cloudflare {
    interface Env extends DemoBindings {}
  }
}
