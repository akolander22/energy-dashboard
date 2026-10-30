const express = require('express');
const path    = require('path');

require('./src/db');  // initializes SQLite schema synchronously

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/stats',    require('./src/routes/stats'));
app.use('/api/circuits', require('./src/routes/circuits'));
app.use('/api/history',  require('./src/routes/history'));
app.use('/api/solar',    require('./src/routes/solar'));

app.listen(PORT, () => {
  console.log(`Energy dashboard running on :${PORT}`);
  require('./src/jobs/recorder').startRecorder();
  require('./src/jobs/dailySummary').startDailySummary();
});
