package com.example.demo.repository;

import com.example.demo.entity.MetroCard;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MetroCardRepository extends JpaRepository<MetroCard, String> {

    boolean existsByPassengerId(String passengerId);

    /** Counts active cards of a passenger, ignoring the card with the given ID. */
    @Query("select count(c) from MetroCard c where c.passengerId = :passengerId and c.isActive = true and c.cardId <> :cardId")
    long countOtherActiveCards(@Param("passengerId") String passengerId, @Param("cardId") String cardId);

    /** Loads a card with a row lock so two simultaneous payments or top-ups cannot overwrite each other's balance. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from MetroCard c where c.cardId = :cardId")
    Optional<MetroCard> findByIdForUpdate(@Param("cardId") String cardId);

    /** Active cards of a passenger, locked for update (used when paying for a ticket with the card). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from MetroCard c where c.passengerId = :passengerId and c.isActive = true")
    List<MetroCard> findActiveCardsForUpdate(@Param("passengerId") String passengerId);
}
