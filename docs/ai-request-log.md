# AI request log

The application’s **AI logs** tab at `/ai-logs` records three user messages
available in this conversation: two task requests and a delivery clarification.
The clarification identifies `https://github.com/tejas764/FSD_LAbs` as the delivery
repository; the requested branch is `newversion`. Each message is preserved verbatim, including
its original spelling, punctuation, and line breaks. Titles and categories are
navigation metadata, not part of the original request.

The page supports text search, category filtering (including **Delivery**), copying an individual request,
and downloading the complete record as JSON or plain text. Filtering the page
does not omit requests from an export. Clipboard failure is reported visibly and
the downloadable alternatives remain available.

This record is a request log for project evaluation. It is not a complete account
of earlier unavailable conversations, an execution transcript, or an audit of
every repository change. It does not contain inferred timestamps, internal
instructions, credentials, or IDE metadata. New entries should only be added
from actual user requests; do not generate missing conversation history.

The canonical records are in `apps/web/lib/ai-request-log.ts`. Their format is
`resqnet-ai-request-log`, version `1`.
