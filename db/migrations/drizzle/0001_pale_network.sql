CREATE TABLE "proposal_translations" (
	"proposal_id" text NOT NULL,
	"locale" text NOT NULL,
	"title" text,
	"body" text,
	"summary" text,
	"translated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_translations_proposal_id_locale_pk" PRIMARY KEY("proposal_id","locale")
);
--> statement-breakpoint
ALTER TABLE "proposal_translations" ADD CONSTRAINT "proposal_translations_proposal_id_snapshot_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."snapshot_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_proposal_translations_locale" ON "proposal_translations" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "idx_proposal_translations_proposal_id" ON "proposal_translations" USING btree ("proposal_id");