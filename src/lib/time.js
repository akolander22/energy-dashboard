// Local calendar dates. toISOString() is UTC, so after 7 pm Central it
// returns tomorrow's date; these use the configured time zone instead.

const TZ = () => process.env.TZ || 'America/Chicago';

// 'YYYY-MM-DD' for the given instant in the local time zone
function localDate(date = new Date(), timeZone = TZ()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// Local date `days` days before today, as 'YYYY-MM-DD'
function localDateDaysAgo(days, now = new Date(), timeZone = TZ()) {
  const [y, m, d] = localDate(now, timeZone).split('-').map(Number);
  // Plain calendar arithmetic in UTC so DST changes can't shift the day
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

module.exports = { localDate, localDateDaysAgo };
