DELETE FROM "AuditLog"
WHERE "reportId" IN (
  SELECT r.id
  FROM "Report" r
  JOIN "Crisis" c ON c.id = r."crisisId"
  WHERE c.name LIKE 'Benchmark Crisis %' OR c.name LIKE 'Scale %'
);

DELETE FROM "Report"
WHERE "crisisId" IN (
  SELECT id FROM "Crisis"
  WHERE name LIKE 'Benchmark Crisis %' OR name LIKE 'Scale %'
);

DELETE FROM "Crisis"
WHERE name LIKE 'Benchmark Crisis %' OR name LIKE 'Scale %';
