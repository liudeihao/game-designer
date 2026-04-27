-- Public (explore) materials are not organized in the owner's private groups.
UPDATE assets SET group_id = null WHERE visibility = 'public';
