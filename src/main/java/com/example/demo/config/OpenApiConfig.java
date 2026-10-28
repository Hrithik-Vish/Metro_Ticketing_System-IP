package com.example.demo.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI metroOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Metro Ticketing System API")
                .version("1.0")
                .description("REST API for the Metro Ticketing System. Use the group selector at the top right: "
                        + "'metro-cards' shows the metro-card endpoints, 'full-api' shows everything."));
    }
}
