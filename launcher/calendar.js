(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CytCalendar = factory();
}(this, function () {
  'use strict';
  // Vietnamese lunar calendar (UTC+7), after Ho Ngoc Duc's public algorithm (astro formulas from Meeus).
  var TZ = 7, PI = Math.PI;
  function int(value) { return Math.floor(value); }
  function jdFromDate(day, month, year) {
    var a = int((14 - month) / 12), y = year + 4800 - a, m = month + 12 * a - 3;
    var jd = day + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - int(y / 100) + int(y / 400) - 32045;
    if (jd < 2299161) jd = day + int((153 * m + 2) / 5) + 365 * y + int(y / 4) - 32083;
    return jd;
  }
  function jdToDate(jd) {
    var a, b, c;
    if (jd > 2299160) { a = jd + 32044; b = int((4 * a + 3) / 146097); c = a - int(b * 146097 / 4); }
    else { b = 0; c = jd + 32082; }
    var d = int((4 * c + 3) / 1461), e = c - int(1461 * d / 4), m = int((5 * e + 2) / 153);
    return [e - int((153 * m + 2) / 5) + 1, m + 3 - 12 * int(m / 10), b * 100 + d - 4800 + int(m / 10)];
  }
  function newMoon(k) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
    var Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    var M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    var Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    var F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    var C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    var deltat = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
    return Jd1 + C1 - deltat;
  }
  function sunLongitude(jdn) {
    var T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
    var M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    var L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    var DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    var L = (L0 + DL) * dr;
    return L - PI * 2 * int(L / (PI * 2));
  }
  function newMoonDay(k) { return int(newMoon(k) + 0.5 + TZ / 24); }
  function sunSector(jd) { return int(sunLongitude(jd - 0.5 - TZ / 24) / PI * 6); }
  function month11(year) {
    var off = jdFromDate(31, 12, year) - 2415021, k = int(off / 29.530588853), nm = newMoonDay(k);
    return sunSector(nm) >= 9 ? newMoonDay(k - 1) : nm;
  }
  function leapOffset(a11) {
    var k = int((a11 - 2415021.076998695) / 29.530588853 + 0.5), last, i = 1, arc = sunSector(newMoonDay(k + i));
    do { last = arc; i += 1; arc = sunSector(newMoonDay(k + i)); } while (arc !== last && i < 14);
    return i - 1;
  }
  // Returns {day, month, year, leap} for a solar date.
  function toLunar(day, month, year) {
    var dayNumber = jdFromDate(day, month, year), k = int((dayNumber - 2415021.076998695) / 29.530588853);
    var monthStart = newMoonDay(k + 1);
    if (monthStart > dayNumber) monthStart = newMoonDay(k);
    var a11 = month11(year), b11 = a11, lunarYear;
    if (a11 >= monthStart) { lunarYear = year; a11 = month11(year - 1); }
    else { lunarYear = year + 1; b11 = month11(year + 1); }
    var diff = int((monthStart - a11) / 29), leap = false, lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
      var leapDiff = leapOffset(a11);
      if (diff >= leapDiff) { lunarMonth = diff + 10; if (diff === leapDiff) leap = true; }
    }
    if (lunarMonth > 12) lunarMonth -= 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return {day: dayNumber - monthStart + 1, month: lunarMonth, year: lunarYear, leap: leap};
  }
  // Solar [day, month, year] for a (non-leap) lunar date.
  function fromLunar(day, month, year) {
    var a11, b11;
    if (month < 11) { a11 = month11(year - 1); b11 = month11(year); }
    else { a11 = month11(year); b11 = month11(year + 1); }
    var k = int(0.5 + (a11 - 2415021.076998695) / 29.530588853), off = month - 11;
    if (off < 0) off += 12;
    if (b11 - a11 > 365 && off >= leapOffset(a11)) off += 1;
    return jdToDate(newMoonDay(k + off) + day - 1);
  }

  // Built-in Vietnamese and international days; private config may add more (birthdays).
  var EVENTS = [
    {name: 'Năm mới', month: 1, day: 1, withYear: true}, {name: 'Valentine', month: 2, day: 14},
    {name: 'Ngày 8/3', month: 3, day: 8}, {name: 'Ngày 30/4', month: 4, day: 30},
    {name: 'Ngày 1/5', month: 5, day: 1}, {name: 'Tết Thiếu nhi', month: 6, day: 1},
    {name: 'Quốc khánh', month: 9, day: 2}, {name: 'Ngày Phụ nữ VN', month: 10, day: 20},
    {name: 'Halloween', month: 10, day: 31}, {name: 'Ngày Nhà giáo', month: 11, day: 20},
    {name: 'Giáng sinh', month: 12, day: 25},
    {name: 'Tết Nguyên đán', month: 1, day: 1, lunar: true}, {name: 'Rằm tháng Giêng', month: 1, day: 15, lunar: true},
    {name: 'Giỗ Tổ Hùng Vương', month: 3, day: 10, lunar: true}, {name: 'Tết Đoan ngọ', month: 5, day: 5, lunar: true},
    {name: 'Vu Lan', month: 7, day: 15, lunar: true}, {name: 'Trung thu', month: 8, day: 15, lunar: true},
    {name: 'Ông Công Ông Táo', month: 12, day: 23, lunar: true}
  ];
  function dayIndex(day, month, year) { return jdFromDate(day, month, year); }
  function validEvent(event) {
    return event && typeof event.name === 'string' && event.name.length > 0 && event.name.length <= 40 &&
      event.month >= 1 && event.month <= 12 && event.day >= 1 && event.day <= 31;
  }
  // Nearest upcoming events (today included), soonest first: [{name, days, date: [d, m, y]}].
  function upcoming(date, extra, count) {
    var d = date.getDate(), m = date.getMonth() + 1, y = date.getFullYear(), today = dayIndex(d, m, y);
    var lunarYear = toLunar(d, m, y).year, found = [];
    EVENTS.concat((Array.isArray(extra) ? extra : []).filter(validEvent)).forEach(function (event) {
      var best = null;
      for (var offset = 0; offset <= 1; offset += 1) {
        var solar = event.lunar ? fromLunar(event.day, event.month, lunarYear + offset) : [event.day, event.month, y + offset];
        var days = dayIndex(solar[0], solar[1], solar[2]) - today;
        if (days >= 0 && (best === null || days < best.days)) best = {days: days, date: solar};
      }
      if (best) found.push({name: event.withYear ? event.name + ' ' + best.date[2] : event.name, days: best.days, date: best.date});
    });
    found.sort(function (a, b) { return a.days - b.days || (a.name < b.name ? -1 : 1); });
    return found.slice(0, count || 3);
  }
  function countdownText(event) {
    if (event.days === 0) return 'Hôm nay: ' + event.name;
    if (event.days === 1) return event.name + ' vào ngày mai';
    return event.name + ' còn ' + event.days + ' ngày';
  }
  // Countdown phrases for the nearest events; the page shows as many as fit on one line (2-3).
  function countdowns(date, extra, count) { return upcoming(date, extra, count || 3).map(countdownText); }
  function greeting(date, name) {
    var hour = date.getHours(), text, period;
    if (hour >= 4 && hour < 11) { text = 'Chào buổi sáng'; period = 'morning'; }
    else if (hour >= 11 && hour < 13) { text = 'Chào buổi trưa'; period = 'noon'; }
    else if (hour >= 13 && hour < 18) { text = 'Chào buổi chiều'; period = 'afternoon'; }
    else if (hour >= 18 && hour < 22) { text = 'Chào buổi tối'; period = 'evening'; }
    else { text = 'Chúc ngủ ngon'; period = 'night'; }
    var who = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    return {text: who ? text + ', ' + who : text, period: period};
  }
  return {toLunar: toLunar, fromLunar: fromLunar, upcoming: upcoming, countdowns: countdowns,
    greeting: greeting, EVENTS: EVENTS};
}));
