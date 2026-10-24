-- Add optional room-capacity fields without changing the existing bed count
-- used by hospital selection. Existing capacities remain NULL until entered.

ALTER TABLE public.hospitals
    ADD COLUMN IF NOT EXISTS total_rooms INTEGER,
    ADD COLUMN IF NOT EXISTS available_rooms INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'hospitals'
          AND column_name IN ('total_rooms', 'available_rooms')
          AND data_type <> 'integer'
    ) THEN
        RAISE EXCEPTION
            'hospitals.total_rooms and available_rooms must be INTEGER columns';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hospitals'::regclass
          AND conname = 'hospitals_total_rooms_nonnegative'
    ) THEN
        ALTER TABLE public.hospitals
            ADD CONSTRAINT hospitals_total_rooms_nonnegative
            CHECK (total_rooms IS NULL OR total_rooms >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hospitals'::regclass
          AND conname = 'hospitals_available_rooms_nonnegative'
    ) THEN
        ALTER TABLE public.hospitals
            ADD CONSTRAINT hospitals_available_rooms_nonnegative
            CHECK (available_rooms IS NULL OR available_rooms >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.hospitals'::regclass
          AND conname = 'hospitals_available_rooms_within_total'
    ) THEN
        ALTER TABLE public.hospitals
            ADD CONSTRAINT hospitals_available_rooms_within_total
            CHECK (
                total_rooms IS NULL OR available_rooms IS NULL
                OR available_rooms <= total_rooms
            );
    END IF;
END $$;
