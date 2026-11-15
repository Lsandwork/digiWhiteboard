-- Expand team_engagement_commit allowlist for template library tables.

create or replace function public.team_engagement_commit(p_ops jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_op jsonb;
  v_kind text;
  v_table text;
  v_values jsonb;
  v_match jsonb;
  v_conflict jsonb;
  v_cols text;
  v_set_cols text;
  v_where text;
  v_rows jsonb;
  v_count integer;
  v_expect integer;
  v_index integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'team_engagement_commit expects an array of operations.' using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'op';
    v_table := v_op->>'table';
    v_expect := nullif(v_op->>'expect_rows', '')::integer;

    if v_table is null or v_table not in (
      'team_engagement_bark_outs', 'team_engagement_moderation_events', 'team_engagement_reactions',
      'team_engagement_reports', 'team_engagement_bark_out_comments',
      'team_engagement_development_records', 'team_engagement_feedback',
      'team_engagement_feedback_events', 'team_engagement_announcements', 'team_engagement_programs',
      'team_engagement_nominations', 'team_engagement_department_profiles', 'team_engagement_department_managers',
      'team_engagement_settings', 'team_engagement_preferences', 'team_engagement_audit_events',
      'team_engagement_milestones', 'team_engagement_milestone_messages',
      'team_engagement_fun_questions', 'team_engagement_fun_question_responses',
      'team_engagement_fun_polls', 'team_engagement_fun_poll_options', 'team_engagement_fun_poll_votes',
      'team_engagement_fun_trivia', 'team_engagement_fun_trivia_answers',
      'team_engagement_spotlights',
      'team_engagement_pack_goals', 'team_engagement_pack_goal_events',
      'team_engagement_voice_surveys', 'team_engagement_voice_questions', 'team_engagement_voice_responses',
      'team_engagement_voice_anonymous_responses', 'team_engagement_voice_anonymous_completions',
      'team_engagement_pack_goal_participants', 'team_engagement_would_you_rather', 'team_engagement_would_you_rather_votes',
      'team_engagement_pack_events', 'team_engagement_pack_event_rsvps',
      'team_engagement_team_pulse_responses', 'team_engagement_voice_outcomes',
      'team_engagement_templates', 'team_engagement_template_favorites', 'team_engagement_template_publications'
    ) then
      raise exception 'team_engagement_commit: table % is not allowed.', coalesce(v_table, '(none)') using errcode = '42501';
    end if;

    if v_table = 'team_engagement_audit_events' and v_kind <> 'insert' then
      raise exception 'Team Engagement audit events are append-only.' using errcode = '42501';
    end if;

    if v_kind in ('insert', 'upsert') then
      v_values := v_op->'values';
      if v_values is null or jsonb_typeof(v_values) <> 'object' then
        raise exception 'team_engagement_commit: % needs values.', v_kind using errcode = '22023';
      end if;
      select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(v_values) as key;

      if v_kind = 'insert' then
        execute format(
          'with ins as (insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning *) '
          || 'select coalesce(jsonb_agg(to_jsonb(ins.*)), ''[]''::jsonb) from ins',
          v_table, v_cols
        ) into v_rows using v_values;
      else
        v_conflict := v_op->'conflict';
        if v_conflict is null or jsonb_typeof(v_conflict) <> 'array' or jsonb_array_length(v_conflict) = 0 then
          raise exception 'team_engagement_commit: upsert needs conflict columns.' using errcode = '22023';
        end if;
        select string_agg(format('%I', value), ', ') into v_where from jsonb_array_elements_text(v_conflict) as value;
        select string_agg(format('%1$I = excluded.%1$I', key), ', ') into v_set_cols
          from jsonb_object_keys(v_values) as key
          where key not in (select value from jsonb_array_elements_text(v_conflict));
        execute format(
          'with ins as (insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) '
          || 'on conflict (%3$s) do update set %4$s returning *) '
          || 'select coalesce(jsonb_agg(to_jsonb(ins.*)), ''[]''::jsonb) from ins',
          v_table, v_cols, v_where, v_set_cols
        ) into v_rows using v_values;
      end if;
    elsif v_kind = 'update' then
      v_match := v_op->'match';
      v_values := v_op->'set';
      if v_match is null or jsonb_typeof(v_match) <> 'object' or v_match = '{}'::jsonb then
        raise exception 'team_engagement_commit: update needs match columns.' using errcode = '22023';
      end if;
      if v_values is null or jsonb_typeof(v_values) <> 'object' or v_values = '{}'::jsonb then
        raise exception 'team_engagement_commit: update needs set columns.' using errcode = '22023';
      end if;
      select string_agg(format('%I', key), ', ') into v_set_cols from jsonb_object_keys(v_values) as key;
      select string_agg(format('t.%1$I is not distinct from m.%1$I', key), ' and ') into v_where
        from jsonb_object_keys(v_match) as key;
      execute format(
        'with m as (select * from jsonb_populate_record(null::public.%1$I, $2)), '
        || 'upd as (update public.%1$I as t set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) '
        || 'from m where %3$s returning t.*) '
        || 'select coalesce(jsonb_agg(to_jsonb(upd.*)), ''[]''::jsonb) from upd',
        v_table, v_set_cols, v_where
      ) into v_rows using v_values, v_match;
    elsif v_kind = 'delete' then
      v_match := v_op->'match';
      if v_match is null or jsonb_typeof(v_match) <> 'object' or v_match = '{}'::jsonb then
        raise exception 'team_engagement_commit: delete needs match columns.' using errcode = '22023';
      end if;
      select string_agg(format('t.%1$I is not distinct from m.%1$I', key), ' and ') into v_where
        from jsonb_object_keys(v_match) as key;
      execute format(
        'with m as (select * from jsonb_populate_record(null::public.%1$I, $1)), '
        || 'del as (delete from public.%1$I as t using m where %2$s returning t.*) '
        || 'select coalesce(jsonb_agg(to_jsonb(del.*)), ''[]''::jsonb) from del',
        v_table, v_where
      ) into v_rows using v_match;
    else
      raise exception 'team_engagement_commit: unknown operation %.', coalesce(v_kind, '(none)') using errcode = '22023';
    end if;

    v_count := jsonb_array_length(v_rows);
    if v_expect is not null and v_count <> v_expect then
      raise exception 'team_engagement_conflict'
        using errcode = 'P0001',
              detail = format('Operation %s on %s changed %s rows; expected %s.', v_index, v_table, v_count, v_expect);
    end if;

    v_results := v_results || jsonb_build_array(v_rows);
    v_index := v_index + 1;
  end loop;

  return v_results;
end;
$$;