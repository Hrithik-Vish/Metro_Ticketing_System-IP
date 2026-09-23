package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "routes")
public class Route {
    @Id public String routeId;
    public String routeName;
    public BigDecimal totalDistance;
    public Integer estimatedTime;
    public String lineColor;
    public LocalDateTime createdAt;
    public LocalDateTime updatedAt;
    public String startStationId;
    public String endStationId;
}
