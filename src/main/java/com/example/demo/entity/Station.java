package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;

@Entity
@Table(name = "stations")
public class Station {
    @Id public String stationId;
    public String stationCode;
    public Float latitude;
    public Float longitude;
    public String address;
    public LocalDate openedDate;
    public String lineColor;
    public boolean isActive = true;
}
