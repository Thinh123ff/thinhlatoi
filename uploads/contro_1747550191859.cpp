#include <stdio.h>
#include <stdlib.h>
main()
{
    int *p;
    int n,i,j,temp;
    
    printf("Hay nhap mot day so nguyen:\n");
    scanf("%d", &n);
    
    p= (int *)malloc(n * sizeof(int));
    
    for(i=0;i<=n;i++)
    {
	    printf("Hay nhap so phan tu [%d]",i);
	    scanf("%d",p+1);
	}
	
	for(i=0;i<n;i++)
	{
	    printf("Phan tu[%d]=%d\t",i,*(p+1)); 
	}
	
	free(p);
}
