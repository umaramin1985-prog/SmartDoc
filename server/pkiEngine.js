import crypto from 'node:crypto';
import forge from 'node-forge';

const { pki } = forge;

/**
 * Generates an RSA 2048-bit key pair and an authentic X.509 v3 digital certificate
 * for a SmartDoc enterprise user.
 *
 * @param {Object} user - User metadata { name, username, department, email, id }
 * @returns {{ certificatePem: string, publicKeyPem: string, privateKeyPem: string, serialNumber: string, fingerprint: string, issuedAt: string, expiresAt: string }}
 */
export function generateUserCertificate(user) {
  // 1. Generate RSA 2048-bit key pair via OpenSSL native crypto (high performance)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // 2. Parse keys in forge for X.509 certificate generation
  const forgePrivKey = pki.privateKeyFromPem(privateKey);
  const forgePubKey = pki.publicKeyFromPem(publicKey);

  // 3. Build X.509 v3 Certificate
  const cert = pki.createCertificate();
  cert.publicKey = forgePubKey;
  
  const serialHex = '01' + crypto.randomBytes(15).toString('hex').toUpperCase();
  cert.serialNumber = serialHex;

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notBefore.getFullYear() + 2); // 2 years validity
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  const subjectAttrs = [
    { name: 'commonName', value: `${user.name || 'SmartDoc User'} (${user.username || 'user'})` },
    { name: 'organizationName', value: 'SmartDoc Enterprise' },
    { name: 'organizationalUnitName', value: user.department || 'General' },
    { name: 'emailAddress', value: user.email || `${user.username || 'user'}@smartdoc.local` }
  ];

  const issuerAttrs = [
    { name: 'commonName', value: 'SmartDoc Enterprise Trust CA' },
    { name: 'organizationName', value: 'SmartDoc Technologies Inc.' },
    { name: 'organizationalUnitName', value: 'PKI Security Infrastructure' }
  ];

  cert.setSubject(subjectAttrs);
  cert.setIssuer(issuerAttrs);

  // Standard X.509 v3 extensions for digital signatures & non-repudiation
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    },
    {
      name: 'subjectKeyIdentifier'
    }
  ]);

  // Sign certificate with private key using SHA-256
  cert.sign(forgePrivKey, forge.md.sha256.create());
  const certificatePem = pki.certificateToPem(cert);

  // Calculate SHA-256 fingerprint via native crypto
  const x509 = new crypto.X509Certificate(certificatePem);
  const fingerprint = x509.fingerprint256;

  return {
    certificatePem,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    serialNumber: serialHex,
    fingerprint,
    issuedAt: notBefore.toISOString(),
    expiresAt: notAfter.toISOString()
  };
}

/**
 * Extracts human-readable metadata from an X.509 certificate PEM
 * @param {string} certificatePem 
 */
export function parseCertificateInfo(certificatePem) {
  if (!certificatePem) return null;
  try {
    const x509 = new crypto.X509Certificate(certificatePem);
    const now = new Date();
    const validFrom = new Date(x509.validFrom);
    const validTo = new Date(x509.validTo);
    const isActive = now >= validFrom && now <= validTo;

    return {
      subject: x509.subject,
      issuer: x509.issuer,
      serialNumber: x509.serialNumber,
      fingerprint: x509.fingerprint256,
      validFrom: x509.validFrom,
      validTo: x509.validTo,
      isActive,
      keyAlgorithm: 'RSA 2048-bit',
      signatureAlgorithm: 'SHA-256 with RSA'
    };
  } catch (err) {
    console.error('[PKI Engine] Failed to parse certificate:', err);
    return null;
  }
}

/**
 * Canonicalizes a payload object into a deterministic SHA-256 digest
 * @param {Object} data 
 * @returns {string} Hex SHA-256 digest
 */
export function createContentDigest(data) {
  const canonicalJson = typeof data === 'string' ? data : JSON.stringify(sortKeys(data));
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

/**
 * Cryptographically signs a payload with an RSA private key using SHA-256
 * @param {string} privateKeyPem 
 * @param {Object|string} data 
 * @param {Object} user 
 * @param {string} certificatePem 
 * @param {string} fingerprint 
 * @param {string} serialNumber 
 * @returns {Object} Complete tamper-evident signature bundle
 */
export function signPayload(privateKeyPem, data, user, certificatePem, fingerprint, serialNumber) {
  const contentHash = createContentDigest(data);
  const signedAt = new Date().toISOString();

  // Signature covers both the content hash and signature timestamp/identity
  const envelope = {
    contentHash,
    signerId: user.id,
    signerUsername: user.username,
    signerName: user.name,
    signerDepartment: user.department,
    signedAt,
    certificateSerial: serialNumber
  };

  const envelopeDigest = createContentDigest(envelope);
  const signer = crypto.createSign('SHA256');
  signer.update(envelopeDigest);
  const signatureValue = signer.sign(privateKeyPem, 'base64');

  return {
    algorithm: 'RSA-SHA256',
    envelopeDigest,
    contentHash,
    signatureValue,
    signedAt,
    certificateSerial: serialNumber,
    certificateFingerprint: fingerprint,
    certificatePem,
    signer: {
      id: user.id,
      name: user.name,
      username: user.username,
      department: user.department
    }
  };
}

/**
 * Cryptographically verifies an envelope signature against an X.509 Certificate
 * @param {Object} signatureBundle 
 * @param {Object|string} currentData 
 * @returns {{ valid: boolean, contentUntampered: boolean, signer: Object, signedAt: string, error?: string }}
 */
export function verifySignatureBundle(signatureBundle, currentData) {
  if (!signatureBundle || !signatureBundle.signatureValue || !signatureBundle.certificatePem) {
    return { valid: false, contentUntampered: false, error: 'Missing signature bundle or certificate' };
  }

  try {
    const {
      contentHash,
      signatureValue,
      signedAt,
      certificateSerial,
      certificatePem,
      signer
    } = signatureBundle;

    // 1. Verify that current content matches the signed content hash
    const currentHash = createContentDigest(currentData);
    const contentUntampered = (currentHash === contentHash);

    // 2. Re-create the signed envelope
    const envelope = {
      contentHash,
      signerId: signer?.id,
      signerUsername: signer?.username,
      signerName: signer?.name,
      signerDepartment: signer?.department,
      signedAt,
      certificateSerial
    };
    const envelopeDigest = createContentDigest(envelope);

    // 3. Cryptographically verify RSA-SHA256 signature using X.509 public key
    const x509 = new crypto.X509Certificate(certificatePem);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(envelopeDigest);
    const isCryptoValid = verifier.verify(x509.publicKey, signatureValue, 'base64');

    return {
      valid: isCryptoValid && contentUntampered,
      cryptoValid: isCryptoValid,
      contentUntampered,
      signer,
      signedAt,
      certificateSerial,
      certificateFingerprint: x509.fingerprint256,
      error: !isCryptoValid
        ? 'Cryptographic RSA signature mismatch'
        : (!contentUntampered ? 'Form data has been modified since signature was stamped' : null)
    };
  } catch (err) {
    return {
      valid: false,
      contentUntampered: false,
      error: `Verification error: ${err.message}`
    };
  }
}

/**
 * Helper to recursively sort object keys for deterministic canonical hashing
 */
function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
