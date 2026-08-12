-- Corrige vínculos históricos da gerente Jaque quando ela ainda pertencia ao SUP Ahmad.
-- Os registros-fonte já guardavam o SUP correto; apenas o gerente_id havia sido
-- sobrescrito pelo vínculo global mais recente (Jaque / Caue).

update public.vendas_salesforce
set gerente_id = 'e6789205-0ebd-4720-b74f-9aab397c6a77'
where id in (
  '11999b61-3e63-4e4c-8e9f-be45359ac310',
  '5c7a3c81-0e79-4c5f-b676-94815d26592e'
)
and superintendente_profile_id = 'b76410d6-0af6-409b-a04b-d493b538a45a';

update public.pastas_salesforce_pv
set gerente_id = 'e6789205-0ebd-4720-b74f-9aab397c6a77'
where id in (
  '92fef6fd-c1f2-436e-b709-58dbd41f0f7c',
  'a13f2222-286c-4bc7-8309-548df49cad34',
  'f30bed6b-0d57-4559-b876-465e6a90a39b',
  '57b3f885-74ad-4920-82ad-1462cc496152'
)
and superintendente_profile_id = 'b76410d6-0af6-409b-a04b-d493b538a45a';
