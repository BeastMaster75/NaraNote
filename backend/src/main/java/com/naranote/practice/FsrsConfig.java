package com.naranote.practice;

import io.github.openspacedrepetition.Scheduler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FsrsConfig {

    /**
     * Stock FSRS with default parameters. Those defaults are the population averages
     * the algorithm ships with; personal optimisation needs a few hundred reviews of
     * history before it beats them, so there is nothing to tune yet.
     */
    @Bean
    Scheduler fsrsScheduler() {
        return Scheduler.builder().build();
    }
}
