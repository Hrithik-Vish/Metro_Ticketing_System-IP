package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "schedules")
public class Schedule {
    @Id public String scheduleId;
    public String trainId;
    public String routeId;
    public String dayOfWeek;
    public LocalDateTime scheduledDeparture;
    public LocalDateTime scheduledArrival;
    public LocalDate validFrom;
    public LocalDate validTo;
    public boolean isActive = true;
    public LocalDateTime createdAt;
}
