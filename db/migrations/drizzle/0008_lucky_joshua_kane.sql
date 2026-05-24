CREATE TABLE "space_translations" (
	"space_id" text NOT NULL,
	"locale" text NOT NULL,
	"about" text,
	"translated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_translations_space_id_locale_pk" PRIMARY KEY("space_id","locale")
);
--> statement-breakpoint
CREATE INDEX "idx_space_translations_locale" ON "space_translations" USING btree ("locale");--> statement-breakpoint
CREATE INDEX "idx_space_translations_space_id" ON "space_translations" USING btree ("space_id");