package com.naranote.activity;

import java.time.LocalDate;

/** What happened on one day. Only days with something on them are returned. */
public record ActivityDay(LocalDate date, int drawn, int added) {
}
