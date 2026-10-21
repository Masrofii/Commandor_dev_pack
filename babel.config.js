'use strict';
// Used by Jest (via babel-jest) so that ESM-only dependencies such as
// htmlparser2 / sanitize-html can be required from CommonJS test files.
module.exports={presets:[['@babel/preset-env',{targets:{node:'current'}}]]};
