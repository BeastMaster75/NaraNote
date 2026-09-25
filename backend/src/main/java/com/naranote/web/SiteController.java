package com.naranote.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Facts about this deployment that public pages need, readable without an account (see
 * {@code SessionInterceptor.PUBLIC_PATHS}). Today that's the privacy page's contact address,
 * which belongs to whoever runs the instance, not to the source code — so it comes from
 * configuration rather than being baked into the frontend build.
 */
@RestController
public class SiteController {

    public record Site(String contactEmail) {}

    private final Site site;

    public SiteController(@Value("${naranote.contact-email:}") String contactEmail) {
        this.site = new Site(contactEmail.isBlank() ? null : contactEmail.strip());
    }

    @GetMapping("/api/site")
    public Site site() {
        return site;
    }
}
