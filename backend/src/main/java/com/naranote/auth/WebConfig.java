package com.naranote.auth;

import com.naranote.logging.RequestLoggingInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final SessionInterceptor sessionInterceptor;
    private final RequestLoggingInterceptor requestLoggingInterceptor;

    public WebConfig(SessionInterceptor sessionInterceptor, RequestLoggingInterceptor requestLoggingInterceptor) {
        this.sessionInterceptor = sessionInterceptor;
        this.requestLoggingInterceptor = requestLoggingInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(sessionInterceptor).addPathPatterns("/api/**");
        registry.addInterceptor(requestLoggingInterceptor).addPathPatterns("/api/**");
    }
}
