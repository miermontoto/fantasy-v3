<script lang="ts">
	// capa raíz: solo los estilos globales. el shell autenticado vive en (app),
	// así /login queda estructuralmente fuera de la sidebar.
	import '../lib/styles/app.css';

	let { children } = $props();
</script>

{@render children()}
