# Seller NDA — Delta (handover-journey)

El NDA del vendedor deja de estar muerto y lo exige la publicación.

## ADDED Requirements

### Requirement: Publicar exige el NDA del vendedor firmado

Publicar un activo MUST exigir un `seller_nda` firmado por el vendedor y la plataforma. El texto MUST
cubrir declaración de titularidad y responsabilidad por lo publicado, confidencialidad con cláusula
penal, no elusión con quien la plataforma le presentó y personas vinculadas (indemnización del 50% del
precio, nunca menos que el triple de la comisión, durante 6 meses), datos personales (Ley 25.326) y ley
y jurisdicción argentinas. La firma MUST pasar por un puerto `ISignatureProvider`, implementado en la
app.

#### Scenario: Publicar sin NDA

- GIVEN un activo con la titularidad comprobada y sin `seller_nda` firmado
- WHEN el vendedor lo publica
- THEN se rechaza y la pantalla le pide firmar el NDA

#### Scenario: Publicar con NDA

- GIVEN un activo con la titularidad comprobada y el `seller_nda` firmado
- WHEN el vendedor lo publica
- THEN queda publicado

### Requirement: Los activos ya publicados firman antes de su próxima oferta

Un activo publicado antes de este cambio MUST seguir publicado, pero el vendedor MUST firmar el NDA
antes de aceptar su próxima oferta.

#### Scenario: Aceptar una oferta sin NDA

- GIVEN un activo publicado sin `seller_nda`
- WHEN el vendedor acepta una oferta
- THEN se rechaza y la pantalla le pide firmar el NDA
