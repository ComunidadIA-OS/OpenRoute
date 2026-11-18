module.exports = {
  extends: './electron-builder.yml',
  win: {
    forceCodeSigning: true,
    azureSignOptions: {
      endpoint: process.env.WINDOWS_SIGNING_ENDPOINT,
      codeSigningAccountName: process.env.WINDOWS_SIGNING_ACCOUNT,
      certificateProfileName: process.env.WINDOWS_SIGNING_PROFILE,
      publisherName: process.env.WINDOWS_SIGNING_PUBLISHER,
      fileDigest: 'SHA256',
      timestampDigest: 'SHA256',
      timestampRfc3161: 'http://timestamp.acs.microsoft.com'
    }
  }
}
