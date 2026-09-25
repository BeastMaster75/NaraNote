package com.naranote.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class SecurityHeadersFilterTest {

    private final SecurityHeadersFilter filter = new SecurityHeadersFilter();

    @Test
    void everyResponse_getsThePolicyHeaders() throws Exception {
        MockHttpServletResponse response = run(new MockHttpServletRequest("GET", "/"));

        assertThat(response.getHeader("Content-Security-Policy"))
                .contains("script-src 'self'")
                .contains("frame-ancestors 'none'")
                .doesNotContain("unsafe-eval");
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeader("Permissions-Policy")).contains("microphone=(self)");
    }

    @Test
    void plainHttp_neverGetsHsts() throws Exception {
        // A local run over http must not teach the browser to insist on https for localhost.
        MockHttpServletResponse response = run(new MockHttpServletRequest("GET", "/"));

        assertThat(response.getHeader("Strict-Transport-Security")).isNull();
    }

    @Test
    void secureRequest_getsHsts() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/");
        request.setSecure(true);

        assertThat(run(request).getHeader("Strict-Transport-Security")).isEqualTo("max-age=31536000");
    }

    private MockHttpServletResponse run(MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
