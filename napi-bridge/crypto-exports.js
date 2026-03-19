// Auto-generated ESM wrapper for node:crypto
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 69 exports from Node.js crypto

import { cryptoBridge } from './browser-builtins.js';
const _impl = cryptoBridge;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const Certificate = typeof _impl.Certificate !== 'undefined' ? _impl.Certificate : _notImplemented('crypto.Certificate');
export const Cipheriv = typeof _impl.Cipheriv !== 'undefined' ? _impl.Cipheriv : _notImplemented('crypto.Cipheriv');
export const Decipheriv = typeof _impl.Decipheriv !== 'undefined' ? _impl.Decipheriv : _notImplemented('crypto.Decipheriv');
export const DiffieHellman = typeof _impl.DiffieHellman !== 'undefined' ? _impl.DiffieHellman : _notImplemented('crypto.DiffieHellman');
export const DiffieHellmanGroup = typeof _impl.DiffieHellmanGroup !== 'undefined' ? _impl.DiffieHellmanGroup : _notImplemented('crypto.DiffieHellmanGroup');
export const ECDH = typeof _impl.ECDH !== 'undefined' ? _impl.ECDH : _notImplemented('crypto.ECDH');
export const Hash = typeof _impl.Hash !== 'undefined' ? _impl.Hash : _notImplemented('crypto.Hash');
export const Hmac = typeof _impl.Hmac !== 'undefined' ? _impl.Hmac : _notImplemented('crypto.Hmac');
export const KeyObject = typeof _impl.KeyObject !== 'undefined' ? _impl.KeyObject : _notImplemented('crypto.KeyObject');
export const Sign = typeof _impl.Sign !== 'undefined' ? _impl.Sign : _notImplemented('crypto.Sign');
export const Verify = typeof _impl.Verify !== 'undefined' ? _impl.Verify : _notImplemented('crypto.Verify');
export const X509Certificate = typeof _impl.X509Certificate !== 'undefined' ? _impl.X509Certificate : _notImplemented('crypto.X509Certificate');
export const argon2 = typeof _impl.argon2 !== 'undefined' ? _impl.argon2 : _notImplemented('crypto.argon2');
export const argon2Sync = typeof _impl.argon2Sync !== 'undefined' ? _impl.argon2Sync : _notImplemented('crypto.argon2Sync');
export const checkPrime = typeof _impl.checkPrime !== 'undefined' ? _impl.checkPrime : _notImplemented('crypto.checkPrime');
export const checkPrimeSync = typeof _impl.checkPrimeSync !== 'undefined' ? _impl.checkPrimeSync : _notImplemented('crypto.checkPrimeSync');
export const constants = typeof _impl.constants !== 'undefined' ? _impl.constants : _notImplemented('crypto.constants');
export const createCipheriv = typeof _impl.createCipheriv !== 'undefined' ? _impl.createCipheriv : _notImplemented('crypto.createCipheriv');
export const createDecipheriv = typeof _impl.createDecipheriv !== 'undefined' ? _impl.createDecipheriv : _notImplemented('crypto.createDecipheriv');
export const createDiffieHellman = typeof _impl.createDiffieHellman !== 'undefined' ? _impl.createDiffieHellman : _notImplemented('crypto.createDiffieHellman');
export const createDiffieHellmanGroup = typeof _impl.createDiffieHellmanGroup !== 'undefined' ? _impl.createDiffieHellmanGroup : _notImplemented('crypto.createDiffieHellmanGroup');
export const createECDH = typeof _impl.createECDH !== 'undefined' ? _impl.createECDH : _notImplemented('crypto.createECDH');
export const createHash = typeof _impl.createHash !== 'undefined' ? _impl.createHash : _notImplemented('crypto.createHash');
export const createHmac = typeof _impl.createHmac !== 'undefined' ? _impl.createHmac : _notImplemented('crypto.createHmac');
export const createPrivateKey = typeof _impl.createPrivateKey !== 'undefined' ? _impl.createPrivateKey : _notImplemented('crypto.createPrivateKey');
export const createPublicKey = typeof _impl.createPublicKey !== 'undefined' ? _impl.createPublicKey : _notImplemented('crypto.createPublicKey');
export const createSecretKey = typeof _impl.createSecretKey !== 'undefined' ? _impl.createSecretKey : _notImplemented('crypto.createSecretKey');
export const createSign = typeof _impl.createSign !== 'undefined' ? _impl.createSign : _notImplemented('crypto.createSign');
export const createVerify = typeof _impl.createVerify !== 'undefined' ? _impl.createVerify : _notImplemented('crypto.createVerify');
export const decapsulate = typeof _impl.decapsulate !== 'undefined' ? _impl.decapsulate : _notImplemented('crypto.decapsulate');
export const diffieHellman = typeof _impl.diffieHellman !== 'undefined' ? _impl.diffieHellman : _notImplemented('crypto.diffieHellman');
export const encapsulate = typeof _impl.encapsulate !== 'undefined' ? _impl.encapsulate : _notImplemented('crypto.encapsulate');
export const generateKey = typeof _impl.generateKey !== 'undefined' ? _impl.generateKey : _notImplemented('crypto.generateKey');
export const generateKeyPair = typeof _impl.generateKeyPair !== 'undefined' ? _impl.generateKeyPair : _notImplemented('crypto.generateKeyPair');
export const generateKeyPairSync = typeof _impl.generateKeyPairSync !== 'undefined' ? _impl.generateKeyPairSync : _notImplemented('crypto.generateKeyPairSync');
export const generateKeySync = typeof _impl.generateKeySync !== 'undefined' ? _impl.generateKeySync : _notImplemented('crypto.generateKeySync');
export const generatePrime = typeof _impl.generatePrime !== 'undefined' ? _impl.generatePrime : _notImplemented('crypto.generatePrime');
export const generatePrimeSync = typeof _impl.generatePrimeSync !== 'undefined' ? _impl.generatePrimeSync : _notImplemented('crypto.generatePrimeSync');
export const getCipherInfo = typeof _impl.getCipherInfo !== 'undefined' ? _impl.getCipherInfo : _notImplemented('crypto.getCipherInfo');
export const getCiphers = typeof _impl.getCiphers !== 'undefined' ? _impl.getCiphers : _notImplemented('crypto.getCiphers');
export const getCurves = typeof _impl.getCurves !== 'undefined' ? _impl.getCurves : _notImplemented('crypto.getCurves');
export const getDiffieHellman = typeof _impl.getDiffieHellman !== 'undefined' ? _impl.getDiffieHellman : _notImplemented('crypto.getDiffieHellman');
export const getFips = typeof _impl.getFips !== 'undefined' ? _impl.getFips : _notImplemented('crypto.getFips');
export const getHashes = typeof _impl.getHashes !== 'undefined' ? _impl.getHashes : _notImplemented('crypto.getHashes');
export const getRandomValues = typeof _impl.getRandomValues !== 'undefined' ? _impl.getRandomValues : _notImplemented('crypto.getRandomValues');
export const hash = typeof _impl.hash !== 'undefined' ? _impl.hash : _notImplemented('crypto.hash');
export const hkdf = typeof _impl.hkdf !== 'undefined' ? _impl.hkdf : _notImplemented('crypto.hkdf');
export const hkdfSync = typeof _impl.hkdfSync !== 'undefined' ? _impl.hkdfSync : _notImplemented('crypto.hkdfSync');
export const pbkdf2 = typeof _impl.pbkdf2 !== 'undefined' ? _impl.pbkdf2 : _notImplemented('crypto.pbkdf2');
export const pbkdf2Sync = typeof _impl.pbkdf2Sync !== 'undefined' ? _impl.pbkdf2Sync : _notImplemented('crypto.pbkdf2Sync');
export const privateDecrypt = typeof _impl.privateDecrypt !== 'undefined' ? _impl.privateDecrypt : _notImplemented('crypto.privateDecrypt');
export const privateEncrypt = typeof _impl.privateEncrypt !== 'undefined' ? _impl.privateEncrypt : _notImplemented('crypto.privateEncrypt');
export const publicDecrypt = typeof _impl.publicDecrypt !== 'undefined' ? _impl.publicDecrypt : _notImplemented('crypto.publicDecrypt');
export const publicEncrypt = typeof _impl.publicEncrypt !== 'undefined' ? _impl.publicEncrypt : _notImplemented('crypto.publicEncrypt');
export const randomBytes = typeof _impl.randomBytes !== 'undefined' ? _impl.randomBytes : _notImplemented('crypto.randomBytes');
export const randomFill = typeof _impl.randomFill !== 'undefined' ? _impl.randomFill : _notImplemented('crypto.randomFill');
export const randomFillSync = typeof _impl.randomFillSync !== 'undefined' ? _impl.randomFillSync : _notImplemented('crypto.randomFillSync');
export const randomInt = typeof _impl.randomInt !== 'undefined' ? _impl.randomInt : _notImplemented('crypto.randomInt');
export const randomUUID = typeof _impl.randomUUID !== 'undefined' ? _impl.randomUUID : _notImplemented('crypto.randomUUID');
export const scrypt = typeof _impl.scrypt !== 'undefined' ? _impl.scrypt : _notImplemented('crypto.scrypt');
export const scryptSync = typeof _impl.scryptSync !== 'undefined' ? _impl.scryptSync : _notImplemented('crypto.scryptSync');
export const secureHeapUsed = typeof _impl.secureHeapUsed !== 'undefined' ? _impl.secureHeapUsed : _notImplemented('crypto.secureHeapUsed');
export const setEngine = typeof _impl.setEngine !== 'undefined' ? _impl.setEngine : _notImplemented('crypto.setEngine');
export const setFips = typeof _impl.setFips !== 'undefined' ? _impl.setFips : _notImplemented('crypto.setFips');
export const sign = typeof _impl.sign !== 'undefined' ? _impl.sign : _notImplemented('crypto.sign');
export const subtle = typeof _impl.subtle !== 'undefined' ? _impl.subtle : _notImplemented('crypto.subtle');
export const timingSafeEqual = typeof _impl.timingSafeEqual !== 'undefined' ? _impl.timingSafeEqual : _notImplemented('crypto.timingSafeEqual');
export const verify = typeof _impl.verify !== 'undefined' ? _impl.verify : _notImplemented('crypto.verify');
export const webcrypto = typeof _impl.webcrypto !== 'undefined' ? _impl.webcrypto : _notImplemented('crypto.webcrypto');

const _module = { Certificate, Cipheriv, Decipheriv, DiffieHellman, DiffieHellmanGroup, ECDH, Hash, Hmac, KeyObject, Sign, Verify, X509Certificate, argon2, argon2Sync, checkPrime, checkPrimeSync, constants, createCipheriv, createDecipheriv, createDiffieHellman, createDiffieHellmanGroup, createECDH, createHash, createHmac, createPrivateKey, createPublicKey, createSecretKey, createSign, createVerify, decapsulate, diffieHellman, encapsulate, generateKey, generateKeyPair, generateKeyPairSync, generateKeySync, generatePrime, generatePrimeSync, getCipherInfo, getCiphers, getCurves, getDiffieHellman, getFips, getHashes, getRandomValues, hash, hkdf, hkdfSync, pbkdf2, pbkdf2Sync, privateDecrypt, privateEncrypt, publicDecrypt, publicEncrypt, randomBytes, randomFill, randomFillSync, randomInt, randomUUID, scrypt, scryptSync, secureHeapUsed, setEngine, setFips, sign, subtle, timingSafeEqual, verify, webcrypto };
export default _module;
