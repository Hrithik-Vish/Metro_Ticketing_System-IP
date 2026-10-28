package com.example.demo.repository;

import com.example.demo.entity.MetroCard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MetroCardRepository extends JpaRepository<MetroCard, String> {

    /** Counts active cards of a passenger, ignoring the card with the given ID. */
    @Query("select count(c) from MetroCard c where c.passengerId = :passengerId and c.isActive = true and c.cardId <> :cardId")
    long countOtherActiveCards(@Param("passengerId") String passengerId, @Param("cardId") String cardId);
}
