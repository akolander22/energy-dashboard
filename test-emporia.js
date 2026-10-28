// Quick Emporia login check — reads credentials from .env, never hard-code them.
require('dotenv').config();
const { EmporiaVue } = require('emporia-vue-lib');

const { EMPORIA_EMAIL, EMPORIA_PASSWORD } = process.env;
if (!EMPORIA_EMAIL || !EMPORIA_PASSWORD) {
  console.error('Set EMPORIA_EMAIL and EMPORIA_PASSWORD in .env first');
  process.exit(1);
}

const vue = new EmporiaVue();
vue.login({ username: EMPORIA_EMAIL, password: EMPORIA_PASSWORD })
  .then(() => console.log('SUCCESS'))
  .catch(err => console.log('FAIL:', err.message));
