package com.naranote.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Only load-bearing once the frontend build is embedded in {@code static/} for the prod image —
 * a client route like /kanji/待 exists only in the browser, so Spring needs to hand back
 * index.html instead of 404ing. The variable path pattern loses to the RestControllers'
 * literal /api/** mappings in Spring's handler resolution, and excluding dotted segments keeps
 * real static assets (js/css/svg) served directly rather than forwarded.
 */
@Controller
public class SpaController {

    @RequestMapping(value = {"/{path:[^.]*}", "/**/{path:[^.]*}"})
    public String forward() {
        return "forward:/index.html";
    }
}
