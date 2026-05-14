CREATE TABLE "governance_protocol_sources" (
	"protocol_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_slug" text,
	"source_name" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"confidence" text NOT NULL,
	"linked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "governance_protocol_sources_protocol_id_source_source_id_pk" PRIMARY KEY("protocol_id","source","source_id")
);
--> statement-breakpoint
CREATE TABLE "governance_protocols" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"website" text,
	"avatar" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_governance_protocol_sources_source_ref" ON "governance_protocol_sources" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "idx_governance_protocol_sources_protocol_id" ON "governance_protocol_sources" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "idx_governance_protocol_sources_source" ON "governance_protocol_sources" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_governance_protocols_slug" ON "governance_protocols" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_governance_protocols_name" ON "governance_protocols" USING btree ("name");