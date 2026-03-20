// Auto-generated ESM wrapper for node:diagnostics_channel
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('diagnostics_channel');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('diagnostics_channel');
  _defaultExport = mod;
  Channel = mod.Channel;
  channel = mod.channel;
  hasSubscribers = mod.hasSubscribers;
  subscribe = mod.subscribe;
  tracingChannel = mod.tracingChannel;
  unsubscribe = mod.unsubscribe;
}
export let Channel;
export let channel;
export let hasSubscribers;
export let subscribe;
export let tracingChannel;
export let unsubscribe;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('diagnostics_channel', _syncNodeApiModuleBindings);
