export type SeasonalHomeLogo =
    | 'christmas'
    | 'easter'
    | 'halloween'
    | 'new-year'
    | 'remembrance'
    | 'st-patricks'
    | 'standard';

const atLocalMidnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addLocalDays = (date: Date, days: number) => {
    const result = atLocalMidnight(date);
    result.setDate(result.getDate() + days);
    return result;
};

const getEasterSunday = (year: number) => {
    const goldenYear = year % 19;
    const century = Math.floor(year / 100);
    const yearInCentury = year % 100;
    const leapCentury = Math.floor(century / 4);
    const centuryRemainder = century % 4;
    const lunarCorrection = Math.floor((century + 8) / 25);
    const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3);
    const epact = (19 * goldenYear + century - leapCentury - solarCorrection + 15) % 30;
    const leapYearInCentury = Math.floor(yearInCentury / 4);
    const yearRemainder = yearInCentury % 4;
    const weekdayCorrection =
        (32 + 2 * centuryRemainder + 2 * leapYearInCentury - epact - yearRemainder) % 7;
    const monthCorrection = Math.floor((goldenYear + 11 * epact + 22 * weekdayCorrection) / 451);
    const month = Math.floor((epact + weekdayCorrection - 7 * monthCorrection + 114) / 31);
    const day = ((epact + weekdayCorrection - 7 * monthCorrection + 114) % 31) + 1;

    return new Date(year, month - 1, day);
};

const isWithinLocalDates = (date: Date, start: Date, end: Date) => {
    const timestamp = atLocalMidnight(date).getTime();
    return timestamp >= start.getTime() && timestamp <= end.getTime();
};

const getRemembrancePeriod = (year: number) => {
    const novemberEighth = new Date(year, 10, 8);
    const remembranceSunday = new Date(year, 10, 8 + ((7 - novemberEighth.getDay()) % 7));
    const remembranceDay = new Date(year, 10, 11);

    return remembranceSunday < remembranceDay
        ? { end: remembranceDay, start: remembranceSunday }
        : { end: remembranceSunday, start: remembranceDay };
};

export const getSeasonalHomeLogo = (date: Date = new Date()): SeasonalHomeLogo => {
    const month = date.getMonth();
    const day = date.getDate();

    if ((month === 11 && day === 31) || (month === 0 && day === 1)) return 'new-year';
    if (month === 11 && day >= 1 && day <= 30) return 'christmas';
    if (month === 9 && day === 31) return 'halloween';

    if (month === 10) {
        const remembrancePeriod = getRemembrancePeriod(date.getFullYear());
        if (isWithinLocalDates(date, remembrancePeriod.start, remembrancePeriod.end)) {
            return 'remembrance';
        }
    }

    if (month === 2 && day === 17) return 'st-patricks';

    const easterSunday = getEasterSunday(date.getFullYear());
    if (isWithinLocalDates(date, addLocalDays(easterSunday, -2), addLocalDays(easterSunday, 1))) {
        return 'easter';
    }

    return 'standard';
};
