# 076 - Actionable diagnostics for unclassified routes

The monthly feed refresh intentionally fails closed when a bus route is absent
from Västtrafik's public line registry. Automatically treating it as public
could include pupil-restricted school transport.

When this occurs, report every affected bus route in one failure, including its
GTFS route ID, number, type, agency, long name and description. Keep the job
unpublished until public eligibility is confirmed and the route is mapped
appropriately. This gives the next run enough context to investigate without
weakening the classification safeguard.

Regression coverage verifies the diagnostic fields and excludes routes that
are registered, belong to another agency, are not buses or are described as
replacement services.
