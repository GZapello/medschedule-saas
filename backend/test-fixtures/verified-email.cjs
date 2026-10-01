// Synthetic verification fixture for tests that exercise registration rather
// than delivery of an OTP. Uses the real token signer and consumption checks.
module.exports = function verifiedEmail(email, purpose = 'clinic_registration') {
  if (process.env.NODE_ENV !== 'test') throw new Error('Verification fixture requires NODE_ENV=test');
  const { randomUUID } = require('node:crypto');
  const { db } = require('../dist/config/database');
  const { EmailService } = require('../dist/services/email.service');
  const id = randomUUID();
  db.prepare("INSERT INTO email_verifications(id,email,purpose,code_hash,status,expires_at,verified_at) VALUES(?,?,?,'synthetic','verified',datetime('now','+1 hour'),datetime('now'))").run(id, email, purpose);
  return EmailService.generateVerificationToken(email, purpose, id);
};
