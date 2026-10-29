package com.example.demo.repository;

import com.example.demo.entity.Fare;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FareRepository extends JpaRepository<Fare, String> {
    boolean existsBySourceStationIdOrDestStationId(String sourceStationId, String destStationId);
}
