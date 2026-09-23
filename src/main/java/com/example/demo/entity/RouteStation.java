package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "route_stations")
public class RouteStation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    public String routeId;
    public String stationId;
    public Integer sequenceNumber;
}
