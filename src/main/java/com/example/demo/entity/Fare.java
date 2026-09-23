package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "fares")
public class Fare {
    @Id public String fareId;
    public String sourceStationId;
    public String destStationId;
    public BigDecimal baseFare;
}
