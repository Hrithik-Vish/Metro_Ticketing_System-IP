package com.example.demo.repository;

import com.example.demo.entity.Schedule;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduleRepository extends JpaRepository<Schedule, String> {
    boolean existsByTrainId(String trainId);

    List<Schedule> findByRouteId(String routeId);
}
