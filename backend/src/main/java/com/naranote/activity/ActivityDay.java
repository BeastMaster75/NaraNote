package com.naranote.activity;

import java.time.LocalDate;

/**
 * What happened on one day. Only days with something on them are returned.
 *
 * @param drawn kanji written by hand
 * @param reviewed words reviewed
 * @param added words and kanji saved
 */
public record ActivityDay(LocalDate date, int drawn, int reviewed, int added) {
}
