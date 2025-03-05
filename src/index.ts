const moduleAlias = require('module-alias')
// Or multiple aliases
moduleAlias.addAliases({
  '@': __dirname
})
/* eslint @typescript-eslint/no-require-imports: "off" */
require('./main')
