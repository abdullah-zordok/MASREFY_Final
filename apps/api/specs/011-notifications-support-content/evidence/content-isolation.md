# Content isolation

RLS, repository filters, customer DTOs, search, cache population, and Realtime tests
all require `published` state. Draft, review, and retired content cannot enter any
customer response or cache entry. Publication is an immediate, authorized approved
action; the diff contains no `content.publish.schedule` job, recurring campaign, or
rich-content execution path.
