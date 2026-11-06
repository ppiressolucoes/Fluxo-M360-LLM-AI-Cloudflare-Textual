-- Cópia sanitizada e sem DEFINER da procedure já existente.
-- Este arquivo documenta o contrato usado pelo piloto; não é executado automaticamente.
DELIMITER $$

CREATE PROCEDURE sp_get_api(IN p_plataforma VARCHAR(100))
BEGIN
    DECLARE v_id BIGINT DEFAULT NULL;
    DECLARE v_agora DATETIME;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET v_agora = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR);
    START TRANSACTION;

    SELECT id
      INTO v_id
      FROM Config_API_IA
     WHERE ind_ativo = 1
       AND dsc_plataforma = p_plataforma
       AND (dth_bloqueio_ate IS NULL OR dth_bloqueio_ate <= v_agora)
     ORDER BY CASE WHEN dth_acesso IS NULL THEN 0 ELSE 1 END,
              dth_acesso ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;

    IF v_id IS NOT NULL THEN
        UPDATE Config_API_IA
           SET dth_acesso = v_agora,
               dth_bloqueio_ate = DATE_ADD(v_agora, INTERVAL 10 SECOND),
               dsc_status = 'Sucesso'
         WHERE id = v_id;

        SELECT id,
               dsc_plataforma,
               dsc_email_cad,
               dsc_api_key,
               dsc_api_secret,
               dsc_url_servico,
               dth_acesso,
               dth_bloqueio_ate,
               dsc_status,
               ind_ativo
          FROM Config_API_IA
         WHERE id = v_id;
    ELSE
        SELECT NULL AS id,
               p_plataforma AS dsc_plataforma,
               NULL AS dsc_email_cad,
               NULL AS dsc_api_key,
               NULL AS dsc_api_secret,
               NULL AS dsc_url_servico,
               NULL AS dth_acesso,
               NULL AS dth_bloqueio_ate,
               'Nenhuma API disponível' AS dsc_status,
               0 AS ind_ativo;
    END IF;

    COMMIT;
END$$

DELIMITER ;
