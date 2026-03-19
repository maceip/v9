// Auto-generated ESM wrapper for node:dns
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 50 exports from Node.js dns

import { dns } from './net-stubs.js';
const _impl = dns;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const ADDRCONFIG = typeof _impl.ADDRCONFIG !== 'undefined' ? _impl.ADDRCONFIG : _notImplemented('dns.ADDRCONFIG');
export const ADDRGETNETWORKPARAMS = typeof _impl.ADDRGETNETWORKPARAMS !== 'undefined' ? _impl.ADDRGETNETWORKPARAMS : _notImplemented('dns.ADDRGETNETWORKPARAMS');
export const ALL = typeof _impl.ALL !== 'undefined' ? _impl.ALL : _notImplemented('dns.ALL');
export const BADFAMILY = typeof _impl.BADFAMILY !== 'undefined' ? _impl.BADFAMILY : _notImplemented('dns.BADFAMILY');
export const BADFLAGS = typeof _impl.BADFLAGS !== 'undefined' ? _impl.BADFLAGS : _notImplemented('dns.BADFLAGS');
export const BADHINTS = typeof _impl.BADHINTS !== 'undefined' ? _impl.BADHINTS : _notImplemented('dns.BADHINTS');
export const BADNAME = typeof _impl.BADNAME !== 'undefined' ? _impl.BADNAME : _notImplemented('dns.BADNAME');
export const BADQUERY = typeof _impl.BADQUERY !== 'undefined' ? _impl.BADQUERY : _notImplemented('dns.BADQUERY');
export const BADRESP = typeof _impl.BADRESP !== 'undefined' ? _impl.BADRESP : _notImplemented('dns.BADRESP');
export const BADSTR = typeof _impl.BADSTR !== 'undefined' ? _impl.BADSTR : _notImplemented('dns.BADSTR');
export const CANCELLED = typeof _impl.CANCELLED !== 'undefined' ? _impl.CANCELLED : _notImplemented('dns.CANCELLED');
export const CONNREFUSED = typeof _impl.CONNREFUSED !== 'undefined' ? _impl.CONNREFUSED : _notImplemented('dns.CONNREFUSED');
export const DESTRUCTION = typeof _impl.DESTRUCTION !== 'undefined' ? _impl.DESTRUCTION : _notImplemented('dns.DESTRUCTION');
export const EOF = typeof _impl.EOF !== 'undefined' ? _impl.EOF : _notImplemented('dns.EOF');
export const FILE = typeof _impl.FILE !== 'undefined' ? _impl.FILE : _notImplemented('dns.FILE');
export const FORMERR = typeof _impl.FORMERR !== 'undefined' ? _impl.FORMERR : _notImplemented('dns.FORMERR');
export const LOADIPHLPAPI = typeof _impl.LOADIPHLPAPI !== 'undefined' ? _impl.LOADIPHLPAPI : _notImplemented('dns.LOADIPHLPAPI');
export const NODATA = typeof _impl.NODATA !== 'undefined' ? _impl.NODATA : _notImplemented('dns.NODATA');
export const NOMEM = typeof _impl.NOMEM !== 'undefined' ? _impl.NOMEM : _notImplemented('dns.NOMEM');
export const NONAME = typeof _impl.NONAME !== 'undefined' ? _impl.NONAME : _notImplemented('dns.NONAME');
export const NOTFOUND = typeof _impl.NOTFOUND !== 'undefined' ? _impl.NOTFOUND : _notImplemented('dns.NOTFOUND');
export const NOTIMP = typeof _impl.NOTIMP !== 'undefined' ? _impl.NOTIMP : _notImplemented('dns.NOTIMP');
export const NOTINITIALIZED = typeof _impl.NOTINITIALIZED !== 'undefined' ? _impl.NOTINITIALIZED : _notImplemented('dns.NOTINITIALIZED');
export const REFUSED = typeof _impl.REFUSED !== 'undefined' ? _impl.REFUSED : _notImplemented('dns.REFUSED');
export const Resolver = typeof _impl.Resolver !== 'undefined' ? _impl.Resolver : _notImplemented('dns.Resolver');
export const SERVFAIL = typeof _impl.SERVFAIL !== 'undefined' ? _impl.SERVFAIL : _notImplemented('dns.SERVFAIL');
export const TIMEOUT = typeof _impl.TIMEOUT !== 'undefined' ? _impl.TIMEOUT : _notImplemented('dns.TIMEOUT');
export const V4MAPPED = typeof _impl.V4MAPPED !== 'undefined' ? _impl.V4MAPPED : _notImplemented('dns.V4MAPPED');
export const getDefaultResultOrder = typeof _impl.getDefaultResultOrder !== 'undefined' ? _impl.getDefaultResultOrder : _notImplemented('dns.getDefaultResultOrder');
export const getServers = typeof _impl.getServers !== 'undefined' ? _impl.getServers : _notImplemented('dns.getServers');
export const lookup = typeof _impl.lookup !== 'undefined' ? _impl.lookup : _notImplemented('dns.lookup');
export const lookupService = typeof _impl.lookupService !== 'undefined' ? _impl.lookupService : _notImplemented('dns.lookupService');
export const promises = typeof _impl.promises !== 'undefined' ? _impl.promises : _notImplemented('dns.promises');
export const resolve = typeof _impl.resolve !== 'undefined' ? _impl.resolve : _notImplemented('dns.resolve');
export const resolve4 = typeof _impl.resolve4 !== 'undefined' ? _impl.resolve4 : _notImplemented('dns.resolve4');
export const resolve6 = typeof _impl.resolve6 !== 'undefined' ? _impl.resolve6 : _notImplemented('dns.resolve6');
export const resolveAny = typeof _impl.resolveAny !== 'undefined' ? _impl.resolveAny : _notImplemented('dns.resolveAny');
export const resolveCaa = typeof _impl.resolveCaa !== 'undefined' ? _impl.resolveCaa : _notImplemented('dns.resolveCaa');
export const resolveCname = typeof _impl.resolveCname !== 'undefined' ? _impl.resolveCname : _notImplemented('dns.resolveCname');
export const resolveMx = typeof _impl.resolveMx !== 'undefined' ? _impl.resolveMx : _notImplemented('dns.resolveMx');
export const resolveNaptr = typeof _impl.resolveNaptr !== 'undefined' ? _impl.resolveNaptr : _notImplemented('dns.resolveNaptr');
export const resolveNs = typeof _impl.resolveNs !== 'undefined' ? _impl.resolveNs : _notImplemented('dns.resolveNs');
export const resolvePtr = typeof _impl.resolvePtr !== 'undefined' ? _impl.resolvePtr : _notImplemented('dns.resolvePtr');
export const resolveSoa = typeof _impl.resolveSoa !== 'undefined' ? _impl.resolveSoa : _notImplemented('dns.resolveSoa');
export const resolveSrv = typeof _impl.resolveSrv !== 'undefined' ? _impl.resolveSrv : _notImplemented('dns.resolveSrv');
export const resolveTlsa = typeof _impl.resolveTlsa !== 'undefined' ? _impl.resolveTlsa : _notImplemented('dns.resolveTlsa');
export const resolveTxt = typeof _impl.resolveTxt !== 'undefined' ? _impl.resolveTxt : _notImplemented('dns.resolveTxt');
export const reverse = typeof _impl.reverse !== 'undefined' ? _impl.reverse : _notImplemented('dns.reverse');
export const setDefaultResultOrder = typeof _impl.setDefaultResultOrder !== 'undefined' ? _impl.setDefaultResultOrder : _notImplemented('dns.setDefaultResultOrder');
export const setServers = typeof _impl.setServers !== 'undefined' ? _impl.setServers : _notImplemented('dns.setServers');

const _module = { ADDRCONFIG, ADDRGETNETWORKPARAMS, ALL, BADFAMILY, BADFLAGS, BADHINTS, BADNAME, BADQUERY, BADRESP, BADSTR, CANCELLED, CONNREFUSED, DESTRUCTION, EOF, FILE, FORMERR, LOADIPHLPAPI, NODATA, NOMEM, NONAME, NOTFOUND, NOTIMP, NOTINITIALIZED, REFUSED, Resolver, SERVFAIL, TIMEOUT, V4MAPPED, getDefaultResultOrder, getServers, lookup, lookupService, promises, resolve, resolve4, resolve6, resolveAny, resolveCaa, resolveCname, resolveMx, resolveNaptr, resolveNs, resolvePtr, resolveSoa, resolveSrv, resolveTlsa, resolveTxt, reverse, setDefaultResultOrder, setServers };
export default _module;
