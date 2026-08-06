<script lang="ts">
	// plantilla de un mánager concreto: el mismo visor que la liga entera, acotado.
	import { page } from '$app/state';
	import RosterView from '$lib/components/RosterView.svelte';
</script>

<RosterView ownerId={page.params.id} />
