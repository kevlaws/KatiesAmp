import assert from 'node:assert/strict';
import test from 'node:test';

import { getSeasonalHomeLogo } from '../src/renderer/features/home/utils/seasonal-home-logo.ts';

const localDate = (year, month, day) => new Date(year, month - 1, day, 12);

test('uses the Christmas logo from 1 to 30 December', () => {
    assert.equal(getSeasonalHomeLogo(localDate(2026, 11, 30)), 'standard');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 12, 1)), 'christmas');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 12, 30)), 'christmas');
});

test('hands over from Christmas to New Year for 31 December and 1 January', () => {
    assert.equal(getSeasonalHomeLogo(localDate(2026, 12, 31)), 'new-year');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 1, 1)), 'new-year');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 1, 2)), 'standard');
});

test('uses the Halloween logo only on 31 October', () => {
    assert.equal(getSeasonalHomeLogo(localDate(2026, 10, 30)), 'standard');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 10, 31)), 'halloween');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 11, 1)), 'standard');
});

test("uses the St Patrick's Day logo only on 17 March", () => {
    assert.equal(getSeasonalHomeLogo(localDate(2026, 3, 16)), 'standard');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 3, 17)), 'st-patricks');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 3, 18)), 'standard');
});

test('covers the period from Remembrance Sunday through 11 November when Sunday is earlier', () => {
    assert.equal(getSeasonalHomeLogo(localDate(2026, 11, 7)), 'standard');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 11, 8)), 'remembrance');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 11, 11)), 'remembrance');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 11, 12)), 'standard');
});

test('covers the period from 11 November through Remembrance Sunday when Sunday is later', () => {
    assert.equal(getSeasonalHomeLogo(localDate(2027, 11, 10)), 'standard');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 11, 11)), 'remembrance');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 11, 14)), 'remembrance');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 11, 15)), 'standard');
});

test('uses the Easter logo from Good Friday through Easter Monday', () => {
    assert.equal(getSeasonalHomeLogo(localDate(2026, 4, 2)), 'standard');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 4, 3)), 'easter');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 4, 6)), 'easter');
    assert.equal(getSeasonalHomeLogo(localDate(2026, 4, 7)), 'standard');

    assert.equal(getSeasonalHomeLogo(localDate(2027, 3, 25)), 'standard');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 3, 26)), 'easter');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 3, 29)), 'easter');
    assert.equal(getSeasonalHomeLogo(localDate(2027, 3, 30)), 'standard');
});
