

package com.digitalqueue.backend.repository;

import com.digitalqueue.backend.entity.QueueToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QueueTokenRepository
        extends JpaRepository<QueueToken, Long> {

    List<QueueToken> findAllByOrderByIdAsc();

    List<QueueToken> findByStatusOrderByIdAsc(String status);
}
