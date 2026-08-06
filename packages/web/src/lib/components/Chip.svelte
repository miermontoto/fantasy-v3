<script lang="ts">
	// primitiva del motivo v1: chip inclinado (retransmisión deportiva) con el
	// contenido contrainclinado para que quede recto. el color entra por
	// style:--c y debe ser siempre un var(--token), nunca hex.
	import type { Snippet } from 'svelte';

	interface Props {
		/** token de color, p.ej. 'var(--pos-1)'; sin él usa el neutro de cada variante */
		c?: string | null;
		/** solid = relleno pleno, tint = relleno translúcido del color, glass = negro translúcido v1 */
		variant?: 'solid' | 'tint' | 'glass';
		title?: string;
		children: Snippet;
	}
	let { c = null, variant = 'tint', title, children }: Props = $props();
</script>

<span class="chip {variant}" style:--c={c} {title}>
	<span class="inner">{@render children()}</span>
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transform: skewX(var(--skew));
		border-radius: var(--radius);
		padding: 0 var(--sp-2);
		font-size: 0.65rem;
		font-weight: 600;
		line-height: 1.7;
		white-space: nowrap;
	}
	.inner {
		display: block;
		transform: skewX(var(--unskew));
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.solid {
		background: var(--c, var(--text-faint));
		color: var(--on-accent);
		font-weight: 700;
	}
	.tint {
		background: color-mix(in srgb, var(--c, var(--text-muted)) 15%, transparent);
		color: var(--c, var(--text-muted));
	}
	.glass {
		background: var(--glass);
		color: var(--text-muted);
	}
</style>
