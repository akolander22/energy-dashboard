node -e 
const { EmporiaVue } = require('emporia-vue-lib');
const vue = new EmporiaVue();
vue.login({ username: 'akolander22+emporia@gmail.com', password: 'bRf$zu4DTpDmhfJ' })
  .then(() => console.log('SUCCESS'))
  .catch(err => console.log('FAIL:', err.message));
