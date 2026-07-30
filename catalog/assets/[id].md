<!-- @content -->
<script setup>
import { useData } from 'vitepress';
const { params } = useData();
</script>

<AssetDetail :id="params.id" />
